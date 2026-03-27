import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/components/query-provider";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "GoldPOS",
	description: "Gold purchase point-of-sale",
	manifest: "/manifest.json",
	appleWebApp: {
		capable: true,
		title: "GoldPOS",
		statusBarStyle: "default",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={cn("font-sans", inter.variable)}>
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
				<meta name="theme-color" content="#1d9e75" />
				<meta name="mobile-web-app-capable" content="yes" />
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
				<QueryProvider>{children}</QueryProvider>
			</body>
		</html>
	);
}
