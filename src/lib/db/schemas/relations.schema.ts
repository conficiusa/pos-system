import { relations } from "drizzle-orm";
import { user } from "./better-auth.schema";
import { customers } from "./customers.schema";
import { orders } from "./orders.schema";
import { valuations } from "./valuations.schema";
import { ledgerEntries } from "./ledgerEnteries.schema";

export const usersRelations = relations(user, ({ many }) => ({
  customersCreated: many(customers),
  ordersCreated: many(orders),
  valuationsProcessed: many(valuations),
  ledgerEntriesCreated: many(ledgerEntries),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [customers.createdBy],
    references: [user.id],
  }),
  orders: many(orders),
  ledgerEntries: many(ledgerEntries),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  createdBy: one(user, {
    fields: [orders.createdBy],
    references: [user.id],
  }),
  valuation: one(valuations, {
    fields: [orders.id],
    references: [valuations.orderId],
  }),
  ledgerEntries: many(ledgerEntries),
}));

export const valuationsRelations = relations(valuations, ({ one, many }) => ({
  order: one(orders, {
    fields: [valuations.orderId],
    references: [orders.id],
  }),
  processedBy: one(user, {
    fields: [valuations.processedBy],
    references: [user.id],
  }),
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  customer: one(customers, {
    fields: [ledgerEntries.customerId],
    references: [customers.id],
  }),
  order: one(orders, {
    fields: [ledgerEntries.orderId],
    references: [orders.id],
  }),
  valuation: one(valuations, {
    fields: [ledgerEntries.valuationId],
    references: [valuations.id],
  }),
  createdBy: one(user, {
    fields: [ledgerEntries.createdBy],
    references: [user.id],
  }),
}));
