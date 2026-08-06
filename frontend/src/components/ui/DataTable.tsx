import { Table } from 'antd'
import type { TableProps } from 'antd'

/** antd Table with the project's shared defaults. `pageSize` omitted → unpaginated. */
export function DataTable<T extends { id: string }>({
  pageSize,
  ...props
}: TableProps<T> & { pageSize?: number }) {
  return (
    <Table<T>
      rowKey="id"
      size="middle"
      pagination={pageSize ? { pageSize, hideOnSinglePage: true, showSizeChanger: false } : false}
      {...props}
    />
  )
}
