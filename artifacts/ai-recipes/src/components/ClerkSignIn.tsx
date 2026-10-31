import { SignIn } from '@clerk/react';
import type { ComponentProps } from 'react';

export default function ClerkSignIn({ basePath, appearance }: { basePath: string; appearance: ComponentProps<typeof SignIn>['appearance'] }) {
  return <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} appearance={appearance} />;
}
