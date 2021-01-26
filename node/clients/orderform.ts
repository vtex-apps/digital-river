import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

import { withToken } from './utils'

const appId = 'digital-river'

export default class OrderFormClient extends JanusClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(context, withToken(context.adminUserAuthToken)(options))
  }

  public async getOrderForm(orderFormId: string): Promise<any> {
    return this.http.get(`/api/checkout/pub/orderForm/${orderFormId}`, {
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
      { checkoutId, paymentSessionId }
    )
  }
}
