import Anthropic from '@anthropic-ai/sdk';

// An empty prepaid balance comes back as a plain 400 (invalid_request_error); only the message says why.
export const OUT_OF_CREDIT_MESSAGE = 'The Anthropic account is out of credit. Ask an admin to top it up under Plans & Billing in the Anthropic Console.';

export function isOutOfCredit(err: unknown): boolean {
  return err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message);
}
