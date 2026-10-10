import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R01_MINT_AUTH'];
export const R01: RuleFn<C> = (i, c) => {
  if (i.token.authoritiesCheckedAt === null) return unknown('R01_MINT_AUTH', 'authorities not checked yet');
  const v = i.token.mintAuthority;
  return mk('R01_MINT_AUTH', v !== null, c.points, { mintAuthority: v, checkedAt: i.token.authoritiesCheckedAt });
};
