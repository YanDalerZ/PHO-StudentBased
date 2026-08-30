import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
  isLoading?: boolean;
}

export function DataTable<T>({ data, columns, pagination, isLoading }: DataTableProps<T>) {
  return (
    <div className="w-full">
      <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col, i) => (
                <th 
                  key={i} 
                  className={cn(
                    "text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-slate-500">
                  Loading data...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-slate-500">
                  No records found.
                </td>
              </tr>
            ) : (
              data.map((item, rowIndex) => (
                <tr 
                  key={rowIndex} 
                  className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                >
                  {columns.map((col, colIndex) => (
                    <td 
                      key={colIndex} 
                      className={cn(
                        "py-3.5 px-4 text-sm text-slate-700",
                        col.className
                      )}
                    >
                      {col.cell 
                        ? col.cell(item) 
                        : col.accessorKey 
                          ? (item[col.accessorKey] as ReactNode) 
                          : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 mt-4">
          <span className="text-sm text-slate-500">
            Page <span className="font-medium text-slate-900">{pagination.currentPage}</span> of <span className="font-medium text-slate-900">{pagination.totalPages}</span>
          </span>
          <div className="flex space-x-2">
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1}
              className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage === pagination.totalPages}
              className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
