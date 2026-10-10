import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R02_FREEZE_AUTH'];
export const R02: RuleFn<C> = (i, c) => {
  if (i.token.authoritiesCheckedAt === null) return unknown('R02_FREEZE_AUTH', 'authorities not checked yet');
  const v = i.token.freezeAuthority;
  return mk('R02_FREEZE_AUTH', v !== null, c.points, { freezeAuthority: v, checkedAt: i.token.authoritiesCheckedAt });
};
