import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

const FOUR_SECONDS = 4 * 1000

export default class OrdersClient extends JanusClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdclientAutCookie: ctx.authToken,
      },
      timeout: FOUR_SECONDS,
    })
  }

  public async getOrder(orderId: string): Promise<any> {
    return this.http.get(`/api/oms/pvt/orders/${orderId}`, {
      metric: 'order-get',
    })
  }
}
