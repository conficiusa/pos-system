// import "dotenv/config";

import { D1Helper } from "@nerdfolio/drizzle-d1-helpers";
import { defineConfig } from "drizzle-kit";

// const isProd = () => process.env.NODE_ENV === "production";

const getCredentials = () => {
	const d1DbHelper = D1Helper.get("DB", { environment: "development" });

	// /** Get credentials for connecting to remote D1 database on Cloudflare */
	// const getCloudflareD1Config = () => ({
	// 	driver: "d1-http",
	// 	dbCredentials: {
	// 		...d1DbHelper.withCfCredentials(
	// 			process.env.CLOUDFLARE_ACCOUNT_ID,
	// 			process.env.CLOUDFLARE_D1_TOKEN,
	// 		).proxyCredentials,
	// 	},
	// });

	/** Get credentials for connecting to local SQLite database created by wrangler */
	const getLocalWranglerSqliteConfig = () => {
		let url = d1DbHelper.sqliteLocalFileCredentials.url;
		return {
			dbCredentials: {
				url,
			},
		};
	};
	return getLocalWranglerSqliteConfig();
};

export default defineConfig({
	...getCredentials(),
	dialect: "sqlite",
	schema: "./src/lib/db/schemas/index.ts",
	out: "./drizzle",
	casing: "camelCase",
	strict: false,
});
