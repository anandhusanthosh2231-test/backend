import { SignUp } from '@clerk/react';

export default function ClerkSignUp({ basePath }: { basePath: string }) {
  return <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />;
}
