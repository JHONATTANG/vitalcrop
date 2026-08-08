import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  className?: string;
}

export default function PageContainer({ children, className }: Props) {
  return (
    <main className={cn('flex-1 overflow-y-auto bg-bg-primary p-6', className)}>
      <div className="max-w-7xl mx-auto animate-fadeIn">
        {children}
      </div>
    </main>
  );
}
