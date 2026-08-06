import { Col, Input, Row, Select, Space } from 'antd'

export interface FilterSelect<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  /** Only honoured by the inline layout. */
  width?: number
}

/**
 * Search box plus zero or more selects. `inline` lays them out at fixed widths;
 * the default grid layout gives each control a responsive column.
 */
export function FilterBar<T extends string>({
  search,
  onSearch,
  placeholder,
  selects = [],
  inline,
  searchWidth,
}: {
  search: string
  onSearch: (value: string) => void
  placeholder: string
  selects?: FilterSelect<T>[]
  inline?: boolean
  searchWidth?: number
}) {
  const input = (
    <Input.Search
      allowClear
      placeholder={placeholder}
      value={search}
      onChange={(e) => onSearch(e.target.value)}
      style={inline ? { width: searchWidth } : undefined}
    />
  )

  if (inline) {
    return (
      <Space wrap>
        {input}
        {selects.map((s, i) => (
          <Select key={i} {...s} style={{ width: s.width }} />
        ))}
      </Space>
    )
  }

  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} sm={14} md={10} lg={8}>
        {input}
      </Col>
      {selects.map((s, i) => (
        <Col xs={24} sm={10} md={8} lg={6} key={i}>
          <Select {...s} style={{ width: '100%' }} />
        </Col>
      ))}
    </Row>
  )
}
