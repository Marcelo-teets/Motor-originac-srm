import { getSupabaseClient } from '../lib/supabase.js';

export type ConnectorBudgetDecision = {
  provider: string;
  sourceCode: string;
  monthKey: string;
  allowed: boolean;
  used: number;
  remaining: number;
  monthlyQuota: number;
  warning: boolean;
  reason: string;
  mode: 'supabase_rpc' | 'memory' | 'blocked_no_supabase';
};

const usage = new Map<string, number>();
const monthKey = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const clampQuota = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 500;
  return Math.min(500, Math.floor(value));
};

const normalizeDecision = (
  provider: string,
  sourceCode: string,
  value: any,
): ConnectorBudgetDecision => ({
  provider: String(value?.provider ?? provider),
  sourceCode,
  monthKey: String(value?.monthKey ?? value?.month_key ?? monthKey()),
  allowed: Boolean(value?.allowed),
  used: Number(value?.used ?? value?.usedAfter ?? value?.used_after ?? 0),
  remaining: Number(value?.remaining ?? 0),
  monthlyQuota: Number(value?.monthlyQuota ?? value?.monthly_quota ?? 500),
  warning: Boolean(value?.warning),
  reason: String(value?.reason ?? (value?.allowed ? 'reserved' : 'blocked')),
  mode: 'supabase_rpc',
});

export class ConnectorBudgetGuard {
  constructor(private readonly defaultMonthlyQuota = 500) {}

  async reserve(provider: string, sourceCode: string, purpose: string, monthlyQuota = this.defaultMonthlyQuota): Promise<ConnectorBudgetDecision> {
    const quota = clampQuota(monthlyQuota);
    const client = getSupabaseClient();

    if (client) {
      try {
        const reserved = await client.rpc('reserve_external_api_request', {
          p_provider: provider,
          p_month_key: monthKey(),
          p_monthly_quota: quota,
          p_soft_target: quota,
          p_source_code: sourceCode,
          p_purpose: purpose,
        });
        return normalizeDecision(provider, sourceCode, reserved);
      } catch {
        // Fall through to memory guard while the mirror migration is not applied.
      }
    }

    if (!client && process.env.NODE_ENV === 'production') {
      return {
        provider,
        sourceCode,
        monthKey: monthKey(),
        allowed: false,
        used: 0,
        remaining: quota,
        monthlyQuota: quota,
        warning: false,
        reason: 'supabase_not_configured',
        mode: 'blocked_no_supabase',
      };
    }

    const key = `${provider}|${monthKey()}`;
    const current = usage.get(key) ?? 0;
    const allowed = current < quota;
    const used = allowed ? current + 1 : current;
    if (allowed) usage.set(key, used);

    return {
      provider,
      sourceCode,
      monthKey: monthKey(),
      allowed,
      used,
      remaining: Math.max(0, quota - used),
      monthlyQuota: quota,
      warning: used >= Math.floor(quota * 0.8),
      reason: allowed ? 'memory_reserved' : 'monthly_quota_exhausted',
      mode: 'memory',
    };
  }
}
