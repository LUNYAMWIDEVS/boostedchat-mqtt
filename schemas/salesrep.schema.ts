import { boolean, pgTable, text } from "drizzle-orm/pg-core";

export type SalesRep = {
  id: string;
  ig_username: string;
  ig_password: string;
  available: boolean;
  country: string;
  city: string;
};

export const salesrep = pgTable("sales_rep_salesrep", {
  //user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
  id: text("id").primaryKey(),
  ig_username: text("ig_username"),
  ig_password: text("ig_password"),
  available: boolean("available"),
  country: text("country"),
  city: text("country"),
});
