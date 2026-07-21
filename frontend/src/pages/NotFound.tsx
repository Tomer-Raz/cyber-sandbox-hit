import { useNavigate } from 'react-router-dom'
import { Button, Result, Space } from 'antd'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Result
        status="404"
        title="404"
        subTitle="This route never made it past the perimeter."
        extra={
          <Space wrap>
            <Button type="primary" onClick={() => navigate('/')}>
              Back to overview
            </Button>
            <Button onClick={() => navigate('/scans/new')}>New scan</Button>
          </Space>
        }
      />
    </div>
  )
}
