import { useNavigate } from 'react-router-dom'
import { Button, Result, Space } from 'antd'
import type { ResultProps } from 'antd'

export interface ResultAction {
  label: string
  to: string
  primary?: boolean
}

/** Full-page Result with navigation actions. `center` fills the viewport (used outside AppLayout). */
export function ResultPage({
  status,
  title,
  subTitle,
  actions,
  center,
}: {
  status: ResultProps['status']
  title: React.ReactNode
  subTitle?: React.ReactNode
  actions: ResultAction[]
  center?: boolean
}) {
  const navigate = useNavigate()
  const result = (
    <Result
      status={status}
      title={title}
      subTitle={subTitle}
      extra={
        <Space wrap>
          {actions.map((a) => (
            <Button key={a.to} type={a.primary ? 'primary' : undefined} onClick={() => navigate(a.to)}>
              {a.label}
            </Button>
          ))}
        </Space>
      }
    />
  )

  if (!center) return result
  return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>{result}</div>
}
