import { IOClients } from '@vtex/api'

import DigitalRiver from './digitalRiver'
import CheckoutClient from './checkout'
import LogisticsClient from './logistics'
import OrderFormClient from './orderform'
import OrdersClient from './orders'

// Extend the default IOClients implementation with our own custom clients.
export class Clients extends IOClients {
  public get digitalRiver() {
    return this.getOrSet('digitalRiver', DigitalRiver)
  }

  public get checkout() {
    return this.getOrSet('checkout', CheckoutClient)
  }

  public get logistics() {
    return this.getOrSet('logistics', LogisticsClient)
  }

  public get orderForm() {
    return this.getOrSet('orderForm', OrderFormClient)
  }

  public get orders() {
    return this.getOrSet('orders', OrdersClient)
  }
}
