# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.22] - 2021-04-19

### Fixed

- Changed the value of `authorizationId` to prevent overwriting when authorization is retried

## [0.0.21] - 2021-03-05

### Added

- Include VTEX cart item `uniqueId` when creating Digital River checkout
- Additional transaction log messaging

## [0.0.20] - 2021-02-17

### Changed

- When creating a Digital River checkout that includes products from a seller account, app now sends the seller SKU for each item instead of the marketplace SKU
- Update docs to explain new gateway affiliation Auto Settlement option

## [0.0.19] - 2021-02-15

### Changed

- Add `delayToAutoSettle` value of 7 days in authorization response
- Add shopper's credit card information to transaction log in authorization response

## [0.0.18] - 2021-02-14

### Fixed

- Send browser IP to Digital River when creating checkout
- Return early cancellation response if no Digital River Order ID is provided

## [0.0.17] - 2021-02-11

### Fixed

- `upstreamIds` should not be an array in `getOrdersByUpstreamId`

## [0.0.16] - 2021-02-11

### Fixed

- Send percentual discounts to Digital River as `percentOff` instead of `amountOff`

## [0.0.15] - 2021-02-11

### Fixed

- Percentual discount calculation

## [0.0.14] - 2021-02-11

### Fixed

- Add `ViewPayments` policy

## [0.0.13] - 2021-02-11

### Fixed

- Fixed URL parsing method from prior version again

## [0.0.12] - 2021-02-11

### Fixed

- Fixed URL parsing method from prior version again

## [0.0.11] - 2021-02-11

### Fixed

- Fixed URL parsing method from prior version again

## [0.0.10] - 2021-02-11

### Fixed

- Fixed URL parsing method from prior version

## [0.0.9] - 2021-02-11

### Fixed

- Improved method to get marketplace account name in a marketplace-seller authorization request

## [0.0.8] - 2021-02-11

### Changed

- Use locale from orderForm when creating Digital River checkout

## [0.0.7] - 2021-02-11

### Fixed

- Add mapping to determine originating Motorola account

## [0.0.6] - 2021-02-11

### Changed

- Set same address for Digital River `shipFrom` and `shipTo`

## [0.0.5] - 2021-02-11

### Changed

- Added `delayToCancel` attribute to payment authorization response
- Updated docs

## [0.0.4] - 2021-02-11

### Changed

- Improved transaction log messages

## [0.0.3] - 2021-02-11

### Fixed

- During payment authorization, update Digital River checkout with `upstreamId` prior to creating Digital River order

## [0.0.2] - 2021-02-11

### Changed

- Removed debug code related to Affirm payment connector
- Updated docs

## [0.0.1] - 2021-02-11

### Added

- Initial release
