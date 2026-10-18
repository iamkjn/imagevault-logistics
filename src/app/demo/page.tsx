import { Workspace } from '@/components/workspace';
export default function Demo() {
  return (
    <Workspace
      demo
      initialView="dashboard"
      user={{
        id: 'user-0',
        name: 'Alex Morgan',
        email: 'alex@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
      }}
    />
  );
}
