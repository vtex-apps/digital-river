📢 Use this project, [contribute](https://github.com/vtex-apps/digital-river) to it or open issues to help evolve it using [Store Discussion](https://github.com/vtex-apps/store-discussion).

# Digital River

<!-- DOCS-IGNORE:start -->
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-0-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->
<!-- DOCS-IGNORE:end -->

This app integrates Digital River with VTEX checkout, allowing shoppers to interact with Digital River's 'Drop-In' component and select from a variety of payment methods all processed through a single Digital River account.

> ⚠️ _This app is under development. For this initial version, orders are sent to Digital River as tax inclusive. Future versions of this app will support integration of Digital River as a tax calculation provider._

> ⚠️ _You must have a Digital River account, and all SKUs must be registered with Digital River. If a shopper attempts to check out with an unregistered SKU, the Digital River 'Drop-In' component will fail to load. Future versions of this app will include a catalog sync feature to automatically register SKUs with Digital River, but for now they must be registered manually using [Digital River's API](https://www.digitalriver.com/docs/digital-river-api-reference/#operation/createSkus)._

## Configuration

1. Install this app in the desired account using the CLI command `vtex install vtexus.connector-digital-river`. If you have multiple accounts configured in a marketplace-seller relationship, install the app and repeat the following steps in each of the related accounts.
2. In your admin sidebar, access the **Other** section and click on `Digital River`.
3. In the settings fields, enter your `Digital River token`, `VTEX App Key` and `VTEX App Token`. For initial testing, use a test `Digital River token` and leave the `Enable production mode` toggle turned off.
4. Add the following JavaScript to your `checkout6-custom.js` file, which is typically edited by accessing the **Store Setup** section in your admin sidebar and clicking `Checkout`, then clicking the blue gear icon and then the `Code` tab:

```js
// DIGITAL RIVER Version 0.0.18
let checkoutUpdated = false
const digitalRiverPaymentGroupClass = '.DigitalRiverPaymentGroup'
const digitalRiverPaymentGroupButtonID =
  'payment-group-DigitalRiverPaymentGroup'

const digitalRiverPublicKey = 'pk_test_1234567890' // NOTE! Enter your Digital River public API key here

const paymentErrorTitle = 'Unable to check out with selected payment method.'
const paymentErrorDescription =
  'Please try a different payment method and try again.'
const loginMessage = 'Please log in to continue payment.'
const loginButtonText = 'LOG IN'
const addressErrorTitle = 'Incomplete shipping address detected.'
const addressErrorDescription =
  'Please check your shipping information and try again.'
const genericErrorTitle = 'Digital River checkout encountered an error.'
const genericErrorDescription =
  'Please check your shipping information and try again.'

async function getCountryCode(country) {
  return await fetch(
    `${
      __RUNTIME__.rootPath || ``
    }/_v/api/digital-river/checkout/country-code/${country}`
  )
    .then((response) => {
      return response.json()
    })
    .then((json) => {
      return json.code
    })
}

function renderErrorMessage(title, body, append = false) {
  if (!append) {
    $(digitalRiverPaymentGroupClass).html(
      `<div><div class='DR-card'><div class='DR-collapse DR-show'><h5 class='DR-error-message'>${title}</h5><div><p>${body}</p></div></div></div></div>`
    )

    return
  }

  $('#VTEX-DR-error').remove()
  $('.DR-pay-button').after(
    `<div id='VTEX-DR-error'><h5 class="DR-error-message">${title}</h5><div><p>${body}</p></div></div>`
  )
}

async function updateOrderForm(method, checkoutId) {
  const orderFormID = vtexjs.checkout.orderFormId

  return await $.ajax({
    url: `${window.location.origin}${
      __RUNTIME__.rootPath || ``
    }/api/checkout/pub/orderForm/${orderFormID}/customData/digital-river/checkoutId`,
    type: method,
    data: { value: checkoutId },
    success() {
      vtexjs.checkout.getOrderForm().done((orderForm) => {
        const { clientPreferencesData } = orderForm
        if (!clientPreferencesData) return
        return vtexjs.checkout.sendAttachment(
          'clientPreferencesData',
          clientPreferencesData
        )
      })
    },
  })
}

function showBuyNowButton() {
  $('.payment-submit-wrap').show()
}

function hideBuyNowButton() {
  $('.payment-submit-wrap').hide()
}

function clickBuyNowButton() {
  $('#payment-data-submit').click()
}

function loadDigitalRiver() {
  const e = document.createElement('script')

  ;(e.type = 'text/javascript'),
    (e.src = 'https://js.digitalriver.com/v1/DigitalRiver.js')
  const [t] = document.getElementsByTagName('script')

  t.parentNode.insertBefore(e, t)

  const f = document.createElement('link')

  ;(f.type = 'text/css'),
    (f.rel = 'stylesheet'),
    (f.href = 'https://js.digitalriverws.com/v1/css/DigitalRiver.css')
  const [u] = document.getElementsByTagName('link')

  u.parentNode.insertBefore(f, u)
}

async function initDigitalRiver(orderForm) {
  hideBuyNowButton()

  if (
    $('#drop-in-spinner').length ||
    ($('#drop-in').length && $('#drop-in').html().length)
  ) {
    return
  }

  $(digitalRiverPaymentGroupClass).html(
    `<div id='drop-in-spinner'><i class="icon-spinner icon-spin"></i></div>`
  )

  $(digitalRiverPaymentGroupClass).append(`<div id='drop-in'></div>`)

  if (!orderForm.canEditData) {
    hideBuyNowButton()
    $(digitalRiverPaymentGroupClass).html(
      `<div><div class='DR-card'><div class='DR-collapse DR-show'><h5 class='DR-error-message'>${loginMessage}</h5><div><a style='cursor: pointer;' onClick='window.vtexid.start()' class='DR-button-text'>${loginButtonText}</a></div></div></div></div>`
    )

    return
  }

  fetch(`${__RUNTIME__.rootPath || ``}/_v/api/digital-river/checkout/create`, {
    method: 'POST',
    body: JSON.stringify({ orderFormId: orderForm.orderFormId }),
  })
    .then((response) => {
      return response.json()
    })
    .then(async (response) => {
      const { checkoutId = null, paymentSessionId = null } = response

      if (!checkoutId || !paymentSessionId) {
        renderErrorMessage(genericErrorTitle, genericErrorDescription, false)

        return
      }

      await updateOrderForm('PUT', checkoutId)

      const digitalriver = new DigitalRiver(digitalRiverPublicKey, {
        locale: orderForm.clientPreferencesData.locale
          ? orderForm.clientPreferencesData.locale.toLowerCase()
          : 'en-us',
      })

      const country = await getCountryCode(
        orderForm.shippingData.address.country
      )

      const configuration = {
        sessionId: paymentSessionId,
        options: {
          flow: 'checkout',
          showSavePaymentAgreement: false,
          button: {
            type: 'buyNow',
          },
          showComplianceSection: true,
          showTermsOfSaleDisclosure: false,
        },
        billingAddress: {
          firstName: orderForm.clientProfileData.firstName,
          lastName: orderForm.clientProfileData.lastName,
          email: orderForm.clientProfileData.email,
          phoneNumber: orderForm.clientProfileData.phone,
          address: {
            line1: `${
              orderForm.shippingData.address.number
                ? `${orderForm.shippingData.address.number} `
                : ''
            }${orderForm.shippingData.address.street}`,
            line2: orderForm.shippingData.address.complement,
            city: orderForm.shippingData.address.city,
            state: orderForm.shippingData.address.state,
            postalCode: orderForm.shippingData.address.postalCode,
            country,
          },
        },
        onSuccess(data) {
          fetch(
            `${
              __RUNTIME__.rootPath || ``
            }/_v/api/digital-river/checkout/update`,
            {
              method: 'POST',
              body: JSON.stringify({ checkoutId, sourceId: data.source.id }),
            }
          )
            .then((rawResponse) => {
              return rawResponse.json()
            })
            .then(() => {
              checkoutUpdated = true
              clickBuyNowButton()
            })
        },
        onCancel(data) {},
        onError(data) {
          console.error(data)
          renderErrorMessage(paymentErrorTitle, paymentErrorDescription, true)
        },
        onReady(data) {},
      }

      const dropin = digitalriver.createDropin(configuration)
      $('#drop-in-spinner').remove()
      dropin.mount('drop-in')
    })
}

$(document).ready(function () {
  loadDigitalRiver()
  if (~window.location.hash.indexOf('#/payment')) {
    if (
      $('.payment-group-item.active').attr('id') ===
      digitalRiverPaymentGroupButtonID
    ) {
      vtexjs.checkout.getOrderForm().done(function (orderForm) {
        initDigitalRiver(orderForm)
      })
    } else {
      showBuyNowButton()
    }
  }
})

$(window).on('orderFormUpdated.vtex', function (evt, orderForm) {
  if (
    ~window.location.hash.indexOf('#/payment') &&
    $('.payment-group-item.active').attr('id') ===
      digitalRiverPaymentGroupButtonID
  ) {
    if (
      !orderForm.shippingData.address ||
      !orderForm.shippingData.address.street ||
      !orderForm.shippingData.address.city ||
      !orderForm.shippingData.address.state ||
      !orderForm.shippingData.address.postalCode ||
      !orderForm.shippingData.address.country
    ) {
      return
    } else {
      initDigitalRiver(orderForm)
    }
  }
})

$(window).on('hashchange', function (ev) {
  if (ev.originalEvent.newURL.includes('profile', 0)) {
    document.getElementById('opt-in-newsletter').checked = false
  }
})
```

5. In your admin sidebar, access the **Transactions** section and click `Payments > Settings`.
6. Click the `Gateway Affiliations` tab and click the green plus sign to add a new affiliation.
7. Click `DigitalRiverV2` from the **Others** list.
8. Modify the `Affiliation name` if desired and then click `Save`. Leave `Application Key` and `Application Token` blank.
9. Click the `Payment Conditions` tab and click the green plus sign to add a new payment condition.
10. Click `DigitalRiver` from the **Other** list.
11. In the `Process with affiliation` dropdown, choose the name of the affiliation that you created in step 8. Set the status to `Active` and click `Save`. Note that this will activate the payment method in checkout!
12. After successfully testing the payment method in test mode, return to the Digital River app settings page from step 2. Replace your test `Digital River token` with a production token and turn on the `Enable Production mode` toggle. Save the settings and your checkout page will be all set to start accepting production orders.

<!-- DOCS-IGNORE:start -->

## Contributors ✨

Thanks goes to these wonderful people:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind are welcome!

<!-- DOCS-IGNORE:end -->
