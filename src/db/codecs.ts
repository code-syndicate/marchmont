import { Long } from 'mongodb'
import type { Area } from '../domain/area'
import { money, type Money } from '../domain/money'

export type MoneyDoc = {
  readonly amount: Long
  readonly currency: string
}

export function encodeMoney(value: Money): MoneyDoc {
  return { amount: Long.fromBigInt(value.amount), currency: value.currency }
}

export function decodeMoney(doc: MoneyDoc): Money {
  // toBigInt, never toNumber. toNumber rounds silently above 2^53.
  return money(doc.amount.toBigInt(), doc.currency)
}

export function encodeArea(area: Area): Long {
  return Long.fromBigInt(area.hundredthsM2)
}

export function decodeArea(value: Long): Area {
  return { hundredthsM2: value.toBigInt() }
}
