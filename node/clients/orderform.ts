import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

const appId = 'digital-river'

const FOUR_SECONDS = 4 * 1000

export default class OrderFormClient extends JanusClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
      },
      timeout: FOUR_SECONDS,
    })
  }

  public async getOrderForm(
    orderFormId: string,
    vtexAppKey: string,
    vtexAppToken: string
  ): Promise<any> {
    return this.http.get(`/api/checkout/pub/orderForm/${orderFormId}`, {
      headers: {
        'X-VTEX-API-AppKey': vtexAppKey,
        'X-VTEX-API-AppToken': vtexAppToken,
      },
      params: { disableAutoCompletion: true },
      metric: 'orderForm-get',
    })
  }

  public async setCustomFields(
    orderFormId: string,
    checkoutId: string,
    paymentSessionId: string
  ): Promise<any> {
    return this.http.put(
      `/api/checkout/pub/orderForm/${orderFormId}/customData/${appId}`,
      { checkoutId, paymentSessionId },
      {
        headers: {
          VtexIdclientAutCookie: this.context.authToken,
        },
      }
    )
  }
}
