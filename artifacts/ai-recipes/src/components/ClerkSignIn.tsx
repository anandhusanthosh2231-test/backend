import { SignIn } from '@clerk/react';

export default function ClerkSignIn({ basePath }: { basePath: string }) {
  return <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />;
}
