import React, { useState, useEffect } from 'react';
import { Card, Form, Row, Col, Button } from 'react-bootstrap';
import ky from 'ky';
import optionsStorage from '../../../../utils/optionsStorage';
import { useTranslation } from 'react-i18next';

const StorageSettings: React.FC = () => {
  const { t } = useTranslation();
  const [provider, setProvider] = useState('gitee_gist');
  const [giteeToken, setGiteeToken] = useState('');
  const [giteeGistId, setGiteeGistId] = useState('');
  const [giteeFileName, setGiteeFileName] = useState('BookmarkSync.json');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');
  const [failReason, setFailReason] = useState('');

  // Load saved settings on mount
  useEffect(() => {
    optionsStorage.getAll().then(saved => {
      if (saved.giteeToken) setGiteeToken(saved.giteeToken);
      if (saved.giteeGistID) setGiteeGistId(saved.giteeGistID);
      if (saved.giteeGistFileName) setGiteeFileName(saved.giteeGistFileName);
    });
  }, []);

  const handleTest = async () => {
    if (!giteeToken || !giteeGistId) {
      setTestStatus('fail');
      setFailReason(t('storage.tokenGistRequired'));
      return;
    }
    setTestStatus('testing');
    setFailReason('');
    try {
      const resp = await ky.get(
        `https://gitee.com/api/v5/gists/${giteeGistId}?access_token=${giteeToken}`,
        { timeout: 10000, retry: 0 }
      );
      if (resp.status === 200) {
        setTestStatus('success');
      } else {
        setTestStatus('fail');
        setFailReason(`HTTP ${resp.status}`);
      }
    } catch (err: any) {
      setTestStatus('fail');
      if (err.name === 'HTTPError') {
        try {
          const body = await err.response.json();
          setFailReason(body.message || `HTTP ${err.response.status}`);
        } catch {
          setFailReason(`HTTP ${err.response.status}`);
        }
      } else if (err.name === 'TimeoutError') {
        setFailReason(t('storage.timeoutError'));
      } else {
        setFailReason(err.message || t('storage.testFailDefault'));
      }
    }
  };

  return (
    <div className="settings-page">
      {/* ═══════ 选择存储服务 ═══════ */}
      <Card className="settings-card">
        <Card.Header className="settings-card-header">{t('storage.selectService')}</Card.Header>
        <Card.Body>
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('storage.provider')}
            </Form.Label>
            <Col sm={9}>
              <Form.Control
                as="select"
                size="sm"
                value={provider}
                onChange={e => setProvider(e.target.value)}
              >
                <option value="gitee_gist">{t('storage.gitee')}</option>
              </Form.Control>
              <Form.Text className="settings-hint">
                {t('storage.providerHint')}
              </Form.Text>
            </Col>
          </Form.Group>
        </Card.Body>
      </Card>

      {/* ═══════ Gitee Gist 配置 ═══════ */}
      {provider === 'gitee_gist' && (
        <Card className="settings-card mt-3">
          <Card.Header className="settings-card-header">{t('storage.gistConfig')}</Card.Header>
          <Card.Body>
            {/* Access Token */}
            <Form.Group as={Row} className="settings-row">
              <Form.Label column sm={3} className="settings-label">
                {t('storage.token')}
                <span className="settings-badge-required">{t('common.required')}</span>
              </Form.Label>
              <Col sm={9}>
                <Form.Control
                  type="password"
                  size="sm"
                  placeholder={t('storage.tokenPlaceholder')}
                  value={giteeToken}
                  onChange={e => {
                    setGiteeToken(e.target.value);
                    optionsStorage.set({ giteeToken: e.target.value });
                  }}
                />
                <Form.Text className="settings-hint">
                  {t('storage.tokenHint')}
                  <a
                    href="https://gitee.com/profile/personal_access_tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="settings-link"
                  > {t('storage.getToken')}</a>
                  {t('storage.tokenHintSuffix')}
                </Form.Text>
              </Col>
            </Form.Group>

            {/* Gist ID */}
            <Form.Group as={Row} className="settings-row">
              <Form.Label column sm={3} className="settings-label">
                {t('storage.gistID')}
                <span className="settings-badge-required">{t('common.required')}</span>
              </Form.Label>
              <Col sm={9}>
                <Form.Control
                  type="text"
                  size="sm"
                  placeholder={t('storage.gistIdPlaceholder')}
                  value={giteeGistId}
                  onChange={e => {
                    setGiteeGistId(e.target.value);
                    optionsStorage.set({ giteeGistID: e.target.value });
                  }}
                />
                <Form.Text className="settings-hint">
                  {t('storage.gistIDHint')}
                  <a
                    href={giteeGistId ? `https://gitee.com/chipsy/codes/${giteeGistId}` : "https://gitee.com/chipsy/codes"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="settings-link"
                  > {t('storage.snippet')}</a>
                  {t('storage.gistIDHintSuffix')}
                </Form.Text>
              </Col>
            </Form.Group>

            {/* File Name */}
            <Form.Group as={Row} className="settings-row">
              <Form.Label column sm={3} className="settings-label">
                {t('storage.filename')}
              </Form.Label>
              <Col sm={9}>
                <Form.Control
                  type="text"
                  size="sm"
                  placeholder={t('storage.filenamePlaceholder')}
                  value={giteeFileName}
                  onChange={e => {
                    setGiteeFileName(e.target.value);
                    optionsStorage.set({ giteeGistFileName: e.target.value });
                  }}
                />
                <Form.Text className="settings-hint">
                  {t('storage.filenameHint')}
                </Form.Text>
              </Col>
            </Form.Group>

            {/* Divider */}
            <hr className="settings-divider" />

            {/* Test connection */}
            <Form.Group as={Row} className="settings-row mb-0">
              <Col sm={{ offset: 3, span: 9 }}>
                <div className="d-flex align-items-center">
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleTest}
                    disabled={testStatus === 'testing'}
                  >
                    {testStatus === 'testing' ? t('storage.testing') : t('storage.test')}
                  </Button>
                  {testStatus === 'success' && (
                    <span className="settings-test-success ml-2">✅ {t('storage.testSuccess')}</span>
                  )}
                  {testStatus === 'fail' && (
                    <span className="settings-test-fail ml-2">❌ {failReason || t('storage.testFailDefault')}</span>
                  )}
                </div>
                <Form.Text className="settings-hint">
                  {t('storage.testHint')}
                </Form.Text>
              </Col>
            </Form.Group>
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

export default StorageSettings;
