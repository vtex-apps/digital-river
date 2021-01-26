import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

import { withToken } from './utils'

export default class OrdersClient extends JanusClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(context, withToken(context.adminUserAuthToken)(options))
  }

  public async getOrder(orderId: string): Promise<any> {
    return this.http.get(`/api/oms/pvt/orders/${orderId}`, {
      metric: 'order-get',
    })
  }
}
