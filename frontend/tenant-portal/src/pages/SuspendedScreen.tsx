import { ShieldAlert } from 'lucide-react';
import { Button } from '../components/ui/button';

export function SuspendedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/20">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-background p-8 text-center shadow-lg">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Account Suspended</h2>
          <p className="text-muted-foreground">
            Your account has been suspended. Please contact support for help.
          </p>
        </div>
        <div className="pt-4">
          <Button variant="outline" onClick={onLogout} className="w-full">
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
