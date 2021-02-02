interface AppSettings {
  digitalRiverToken: string
}
interface Authentication {
  username: string
  password: string
}
interface Capture {
  id: string
  createdTime: string
  updatedTime: string
  amount: number
  state: string
  failureCode: string
  failureMessage: string
}
interface Charge {
  id: string
  createdTime: string
  currency: string
  amount: number
  state: string
  sourceId: string
  paymentSessionId: string
  captured: boolean
  captures: Capture[]
  orderId: string
}
interface CheckoutAddress {
  line1: string
  line2?: string
  city: string
  postalCode: string
  state: string
  country: string
}
interface CheckoutItem {
  skuId: string
  quantity: number
  price: number
  discount?: Discount
  shipFrom?: CheckoutShipFrom
  metadata?: CheckoutMetadata
}
interface CheckoutMetadata {
  paymentId?: string
  taxHubRequestId?: string
}
interface CheckoutShipFrom {
  address: CheckoutAddress
}
interface CheckoutShippingChoice {
  amount: number
  description: string
  serviceLevel: string
}
interface CheckoutShipTo {
  address: CheckoutAddress
  name: string
  phone: string
}
interface Discount {
  amountOff: number
  percentOff?: number
  quantity: number
}
interface DRCheckoutPayload {
  customerId?: string
  sourceId?: string
  currency: string
  applicationId: string
  taxInclusive: boolean
  browserIp?: string
  email: string
  shipFrom?: CheckoutShipFrom
  shipTo: CheckoutShipTo
  items: CheckoutItem[]
  upstreamId?: string
  metadata?: CheckoutMetadata
  shippingChoice: CheckoutShippingChoice | null
  locale: string
}
interface DRCheckoutResponse {
  id: string
  createdTime: string
  currency: string
  email: string
  updatedTime?: string
  customerId?: string
  sourceId?: string
  shipTo: CheckoutShipTo
  shipFrom: CheckoutShipFrom
  totalAmount: number
  subtotal: number
  totalFees: number
  totalTax: number
  totalImporterTax: number
  totalDuty: number
  totalDiscount: number
  totalShipping: number
  items: OrderResponseItem[]
  shippingChoice: ShippingChoice
  upstreamId: string
  browserIp?: string
  locale: string
  applicationId: string
  customerType: string
  paymentSessionId: string
  sellingEntity: SellingEntity
  liveMode: boolean
}
interface DRCreditCard {
  cvv: string
  expirationMonth: number
  expirationYear: number
  number: string
}
interface DRCreditCardResponse {
  brand: string
  expirationMonth: number
  expirationYear: number
  lastFourDigits: string
}
interface DRFulfillmentPayload {
  orderId: string
  items: FulfillmentItem[]
}
interface DRFulfillmentResponse {
  id: string
  createdTime: string
  orderId: string
  items: FulfillmentResponseItem[]
  liveMode: boolean
  trackingCompany: string
  trackingNumber: string
  trackingUrl: string
}
interface DROrderPayload {
  checkoutId: string
  sourceId?: string
  metadata?: Record<string, any>
}
interface DROrderResponse {
  id: string
  createdTime: string
  currency: string
  email: string
  totalTax: number
  totalFees: number
  totalDuty: number
  totalDiscount: number
  totalShipping: number
  totalAmount: number
  items: OrderResponseItem[]
  shippingChoice: ShippingChoice
  paymentSessionId: string
  state: string
  stateTransitions: StateTransitions
  fraudState: string
  fraudStateTransitions: FraudStateTransitions
  sourceId: string
  charges: Charge[]
  liveMode: boolean
  updatedTime: string
  metadata: CheckoutMetadata
}
interface DROrdersResponse {
  hasMore: boolean
  data: DROrderResponse[]
}
interface DRRefundPayload {
  orderId: string
  currency: string
  amount: number
  reason: string
}
interface DRRefundResponse {
  id: string
  createdTime: string
  orderId: string
  invoiceId: string
  currency: string
  type: string
  amount: number
  refundedAmount: number
  items: RefundItem[]
  reason: string
  failureReason: string
  state: string
  tokenInformation: TokenInformation
  expiresTime: string
  liveMode: boolean
  metadata: CheckoutMetadata
}
interface DRReturnOrderPayload {
  orderId: string
  reason: string
  items: ReturnItem[]
}
interface DRReturnOrderResponse {
  id: string
  createdTime: string
  currency: string
  items: ReturnResponseItem[]
  orderId: string
  reason: string
  state: string
  liveMode: boolean
}
interface DRSourcePayload {
  type: string
  paymentSessionId: string
  reusable: boolean
  owner: Owner
  creditCard: DRCreditCard
}
interface DRSourceResponse {
  id: string
  createdTime: string
  type: string
  currency: string
  amount: number
  reusable: boolean
  state: string
  owner: Owner
  paymentSessionId: string
  clientSecret: string
  creditCard: DRCreditCardResponse
  liveMode: boolean
}
interface DRTax {
  rate: number
  amount: number
}
interface DRWebhookPayload {
  types: string[]
  apiVersion: string
  enabled: boolean
  address: string
  authentication?: Authentication
}
interface DRWebhookResponse {
  id: string
  createdTime: string
  updatedTime: string
  types: string[]
  apiVersion: string
  enabled: boolean
  address: string
  transportType: string
  authentication?: Authentication
}
interface Duties {
  amount: number
}
interface Fees {
  amount: number
  taxAmount: number
}
interface FulfillmentItem {
  itemId: string
  quantity?: number
  cancelQuantity?: number
}
interface FulfillmentResponseItem {
  itemId: string
  skuId: string
  quantity: number
  cancelQuantity: number
}
interface FraudStateTransitions {
  passed: string | null
}
interface ImporterTax {
  amount: number
}
interface OrderFormConfiguration {
  paymentConfiguration: PaymentConfiguration
  taxConfiguration: TaxConfiguration | null
  minimumQuantityAccumulatedForItems: number
  decimalDigitsPrecision: number
  minimumValueAccumulated: number
  apps: [OrderFormConfigurationApp]
  allowMultipleDeliveries: boolean
  allowManualPrice: boolean
  maxNumberOfWhiteLabelSellers?: number | null
  maskFirstPurchaseData?: unknown | null
  recaptchaValidation?: unknown | null
  maskStateOnAddress?: unknown | null
}
interface OrderFormConfigurationApp {
  fields: [string]
  id: string
  major: number
}
interface OrderResponseItem {
  id: string
  skuId: string
  amount: number
  quantity: number
  tax: DRTax
  importerTax: ImporterTax
  duties: Duties
  availableToRefundAmount: number
  fees: Fees
  metadata?: CheckoutMetadata
}
interface Owner {
  firstName: string
  lastName: string
  email: string
  address: CheckoutAddress
}
interface PaymentConfiguration {
  requiresAuthenticationForPreAuthorizedPaymentOption: boolean
  allowInstallmentsMerge?: boolean | null
  blockPaymentSession?: boolean | null
  paymentSystemToCheckFirstInstallment?: unknown | null
  defaultPaymentSystemToApplyOnUserOrderForm?: unknown | null
}
interface RefundItem {
  itemId: string
  type: string
  amount: number
}
interface ReturnItem {
  itemId: string
  skuId: string
  quantity: number
}
interface ReturnResponseItem {
  amount: number
  quantity: number
  quantityAccepted: number
  skuId: string
  state: string
}
interface SellingEntity {
  id: string
  name: string
}
interface ShippingChoice {
  taxAmount: number
}
interface StateTransitions {
  submitted: string | null
}
interface TaxConfiguration {
  url: string
  authorizationHeader: string
  allowExecutionAfterErrors: boolean
  integratedAuthentication: boolean
  appId: string | null
}
interface TokenInformation {
  token: string
  expiresTime: string
}

interface CheckoutRequest {
  orderFormId: string
  salesChannel: string
  items: OrderTaxItem[]
  clientEmail: string | null
  clientData: OrderTaxClient | null
  shippingDestination: OrderTaxShippingInformation
  totals: OrderTaxTotal[]
  paymentData: OrderTaxPayment[] | null
}

interface OrderTaxItem {
  id: string
  sku: string
  ean: string
  refId: string | null
  unitMultiplier: number
  measurementUnit: string
  targetPrice: number
  itemPrice: number
  quantity: number
  discountPrice: number | null
  dockId: string
  freightPrice: number
  brandId: string
}

interface OrderTaxClient {
  email: string
  document: string
  corporateDocument: string | null
  stateInscription: string | null
}

interface OrderTaxTotal {
  id: string
  name: string
  value: number
}

interface OrderTaxPayment {
  paumentSystem: string
  bin: string | null
  referenceValue: number
  value: number
  installments: number | null
}

interface OrderTaxShippingInformation {
  country: string
  state: string
  city: string
  neighborhood: string
  street: string
  postalCode: string
}

interface TaxResponse {
  itemTaxResponse: ItemTaxResponse[]
  hooks: Hook[]
}

interface ItemTaxResponse {
  id: string
  taxes: Tax[]
}

interface Tax {
  name: string
  rate?: number
  description?: string
  value: number
}

interface Hook {
  major: number
  url: string
}
