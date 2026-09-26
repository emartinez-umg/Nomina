import { cn } from './utils';
export function Table({ className, ...props }) {
  return (
    <div className="relative w-full overflow-auto rounded-lg border border-border">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function TableHeader(props) {
  return <thead className="bg-table-head text-foreground" {...props} />;
}
export function TableBody(props) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />;
}
export function TableRow(props) {
  return (
    <tr className="border-b border-border transition-colors hover:bg-secondary/50" {...props} />
  );
}
export function TableHead(props) {
  return (
    <th className="h-12 whitespace-nowrap px-4 text-left align-middle font-semibold" {...props} />
  );
}
export function TableCell(props) {
  return <td className="max-w-72 px-4 py-4 align-middle" {...props} />;
}
