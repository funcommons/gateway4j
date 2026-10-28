export interface TableColumn<R = Record<string, unknown>> {
  prop?: string
  label?: string
  width?: number | string
  minWidth?: number | string
  align?: 'left' | 'center' | 'right'
  headerAlign?: 'left' | 'center' | 'right'
  fixed?: boolean | 'left' | 'right'
  sortable?: boolean | 'custom'
  overflow?: boolean
  formatter?: (row: R, column: unknown, cellValue: unknown, index: number) => string
}
