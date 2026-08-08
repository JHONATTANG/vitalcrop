'use client';
import PageContainer from '@/components/layout/PageContainer';
import CommandPanel from '@/components/commands/CommandPanel';

export default function CommandsPage() {
  return (
    <PageContainer>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-text-primary">Command Center</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Send control commands to your IoT nodes
        </p>
      </div>
      <CommandPanel />
    </PageContainer>
  );
}
