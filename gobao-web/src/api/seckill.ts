import { apiRequest } from './client';
import type { SeckillActivity, SeckillPurchaseResult } from '../lib/types';

export function fetchSeckillActivity(activityId: number): Promise<{ activity: SeckillActivity }> {
  return apiRequest(`/api/v1/seckill/activities/${activityId}`);
}

export function purchaseSeckill(
  activityId: number,
  payload: { request_id: string; quantity: 1 },
): Promise<SeckillPurchaseResult> {
  return apiRequest(
    `/api/v1/seckill/activities/${activityId}/purchase`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { auth: true },
  );
}
