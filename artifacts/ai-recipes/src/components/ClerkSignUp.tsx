import { SignUp } from '@clerk/react';
import type { ComponentProps } from 'react';

export default function ClerkSignUp({ basePath, appearance }: { basePath: string; appearance: ComponentProps<typeof SignUp>['appearance'] }) {
  return <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} appearance={appearance} />;
}
