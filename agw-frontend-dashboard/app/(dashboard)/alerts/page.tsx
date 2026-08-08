'use client';
import PageContainer from '@/components/layout/PageContainer';
import AlertsList from '@/components/alerts/AlertsList';

export default function AlertsPage() {
  return (
    <PageContainer>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-text-primary">Alert Center</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Monitor and acknowledge system alerts
        </p>
      </div>
      <AlertsList />
    </PageContainer>
  );
}
