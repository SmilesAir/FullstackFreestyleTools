import 'server-only';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

// The live table this bridges with (see the plan). Also, as of the eventSummaryTable
// addition below: freestylejudge.com/admin turns out to list its events from
// event-summary-service, not from a scan of this table - so a bridged event needs an entry
// there too to actually show up, even though nothing suggests the live judging flow itself
// writes to it day-to-day (confirmed by checking a real event there vs. a newly-bridged one).
export const TABLE_NAME = 'freestyle-judge-production-dataTable';
export const EVENT_SUMMARY_TABLE_NAME = 'event-summary-service-production-eventSummaryTable';
// event-summary-service caches getAllEvents' response in S3 and only re-scans
// EVENT_SUMMARY_TABLE_NAME when this single item's isEventDataDirty is true (source:
// SmilesAir/EventSummaryService aws/source/main.js) - its own write path (setEventSummary)
// sets this; a raw PutItem to the table, like this bridge's, bypasses that entirely, so the
// admin site's cache never invalidates unless something also flips this flag.
export const EVENT_SUMMARY_INFO_TABLE_NAME = 'event-summary-service-production-infoTable';
// Same story again for a bridged event's divisions: freestylejudge.com/admin gets its
// division/results list from event-results-service (getAllResults -> PointsService's
// client calls it), not from anything this bridge already writes. Same caching pattern -
// its own info table's field is named isResultsDataDirty (source:
// SmilesAir/EventResultsService aws/source/main.js), a different name than
// event-summary-service's isEventDataDirty.
export const EVENT_RESULTS_TABLE_NAME = 'event-results-service-production-eventResultsTable';
export const EVENT_RESULTS_INFO_TABLE_NAME = 'event-results-service-production-infoTable';

const globalForDynamo = globalThis as unknown as { dynamoDoc?: DynamoDBDocumentClient };

function client(): DynamoDBDocumentClient {
  if (!globalForDynamo.dynamoDoc) {
    const raw = new DynamoDBClient({ region: process.env.BRIDGE_AWS_REGION || 'us-west-2' });
    globalForDynamo.dynamoDoc = DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return globalForDynamo.dynamoDoc;
}

export async function dynamoGetItem<T = Record<string, unknown>>(key: string, table: string = TABLE_NAME): Promise<T | null> {
  const result = await client().send(new GetCommand({ TableName: table, Key: { key } }));
  return (result.Item as T) ?? null;
}

export async function dynamoPutItem(item: Record<string, unknown> & { key: string }, table: string = TABLE_NAME): Promise<void> {
  await client().send(new PutCommand({ TableName: table, Item: item }));
}

// Every table this bridges with is small (low hundreds to low thousands of items, single-
// digit MB) so a full scan is cheap; re-evaluate (e.g. a GSI, or filtering to a known set of
// ids) if that stops being true.
export async function dynamoScanAll(table: string = TABLE_NAME): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await client().send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}
