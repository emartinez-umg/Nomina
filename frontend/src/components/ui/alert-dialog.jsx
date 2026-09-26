import * as P from '@radix-ui/react-alert-dialog';
import { buttonVariants } from './button';
export const AlertDialog = P.Root,
  AlertDialogTitle = P.Title,
  AlertDialogDescription = P.Description;
export function AlertDialogContent({ children }) {
  return (
    <P.Portal>
      <P.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
      <P.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
        {children}
      </P.Content>
    </P.Portal>
  );
}
export function AlertDialogCancel(props) {
  return <P.Cancel className={buttonVariants({ variant: 'outline' })} {...props} />;
}
export function AlertDialogAction(props) {
  return <P.Action className={buttonVariants({ variant: 'destructive' })} {...props} />;
}
