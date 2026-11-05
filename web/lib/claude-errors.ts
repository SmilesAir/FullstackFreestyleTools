import Anthropic from '@anthropic-ai/sdk';

// An empty prepaid balance comes back as a plain 400 (invalid_request_error); only the message says why.
// What to tell the person is t.supportChat.outOfCredit (lib/i18n).
export function isOutOfCredit(err: unknown): boolean {
  return err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message);
}
