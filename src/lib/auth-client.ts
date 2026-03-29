import { createAuthClient } from "better-auth/react";
import { adminClient, customSessionClient } from "better-auth/client/plugins";
import { auth } from "./auth";

export const authClient = createAuthClient({
  plugins: [adminClient(), customSessionClient<typeof auth>()],
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
