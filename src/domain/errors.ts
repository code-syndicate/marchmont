export class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class UnknownCurrencyError extends DomainError {
  constructor(currency: string) {
    super('UNKNOWN_CURRENCY', `Unknown currency code "${currency}"`)
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(a: string, b: string) {
    super('CURRENCY_MISMATCH', `Cannot combine ${a} and ${b}. Every price carries its own currency.`)
  }
}

export class InvalidAmountError extends DomainError {
  constructor(message: string) {
    super('INVALID_AMOUNT', message)
  }
}

export class InvalidAreaError extends DomainError {
  constructor(message: string) {
    super('INVALID_AREA', message)
  }
}
