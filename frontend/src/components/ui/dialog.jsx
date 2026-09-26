import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './utils';
export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({ children, className, ...props }) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px]" />
      <Primitive.Content
        className={cn(
          'dialog-content fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-white shadow-2xl',
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close
          aria-label="Cerrar formulario"
          className="absolute right-5 top-5 rounded p-1 hover:bg-secondary focus-visible:ring-2"
        >
          <X size={22} />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
