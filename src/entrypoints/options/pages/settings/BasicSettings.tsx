import React, { useState, useEffect } from 'react';
import { Card, Form, Row, Col } from 'react-bootstrap';
import optionsStorage from '../../../../utils/optionsStorage';
import { useTranslation } from 'react-i18next';

function applyTheme(theme: string) {
  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.remove('theme-light');
    html.classList.add('theme-dark');
  } else if (theme === 'light') {
    html.classList.remove('theme-dark');
    html.classList.add('theme-light');
  } else {
    // auto
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.classList.toggle('theme-dark', dark);
    html.classList.toggle('theme-light', !dark);
  }
}

const BasicSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState('zh');
  const [theme, setTheme] = useState('auto');
  const [enableNotify, setEnableNotify] = useState(true);
  const [deviceName, setDeviceName] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState('30');
  const [syncIntervalCustom, setSyncIntervalCustom] = useState('');
  const [formatJson, setFormatJson] = useState(false);
  const [conflictStrategy, setConflictStrategy] = useState('smart');
  const [orderSyncStrategy, setOrderSyncStrategy] = useState('none');
  const [enableEncryption, setEnableEncryption] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [safeMode, setSafeMode] = useState(true);
  const [safeThreshold, setSafeThreshold] = useState(20);
  const [snapshotCount, setSnapshotCount] = useState('100');
  const [snapshotCustom, setSnapshotCustom] = useState('');

  // Load saved settings on mount
  useEffect(() => {
    optionsStorage.getAll().then(async saved => {
      if (saved.enableNotify !== undefined) setEnableNotify(saved.enableNotify);
      if (saved.formatJson !== undefined) setFormatJson(saved.formatJson);
      if (saved.conflictStrategy !== undefined) setConflictStrategy(saved.conflictStrategy);
      if (saved.orderSyncStrategy !== undefined) setOrderSyncStrategy(saved.orderSyncStrategy);
      if (saved.autoSync !== undefined) setAutoSync(saved.autoSync);
      if (saved.syncInterval !== undefined) {
        const iv = saved.syncInterval;
        if ([5, 10, 30, 60, 120].includes(iv)) {
          setSyncInterval(String(iv));
        } else {
          setSyncInterval('custom');
          setSyncIntervalCustom(String(iv));
        }
      }
      if (saved.deviceName) {
        setDeviceName(saved.deviceName);
      } else {
        // First time: generate a default device name
        const { getDefaultDeviceName } = await import('../../../../utils/deviceName');
        const name = await getDefaultDeviceName();
        setDeviceName(name);
        optionsStorage.set({ deviceName: name });
      }
      if (saved.snapshotCount) setSnapshotCount(String(saved.snapshotCount));
      if (saved.safeMode !== undefined) setSafeMode(saved.safeMode);
      if (saved.safeThreshold !== undefined) setSafeThreshold(saved.safeThreshold);
      if (saved.language) setLanguage(saved.language);
      if (saved.theme) setTheme(saved.theme);
      if (saved.enableEncryption !== undefined) setEnableEncryption(saved.enableEncryption);
      if (saved.encryptionPassword) setEncryptionPassword(saved.encryptionPassword);
    });
  }, []);

  const showSyncIntervalCustom = syncInterval === 'custom';
  const showSnapshotCustom = snapshotCount === 'custom';

  return (
    <div className="settings-page">
      {/* ═══════ 外观设置 ═══════ */}
      <Card className="settings-card">
        <Card.Header className="settings-card-header">{t('settings.appearance')}</Card.Header>
        <Card.Body>
          {/* 页面语言 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.language')}
            </Form.Label>
            <Col sm={9}>
              <Form.Control
                as="select"
                size="sm"
                value={language}
                onChange={e => {
                  const val = e.target.value;
                  setLanguage(val);
                  optionsStorage.set({ language: val });
                  i18n.changeLanguage(val);
                }}
              >
                <option value="zh">{t('settings.langZh')}</option>
                <option value="zh-TW">{t('settings.langZhTW')}</option>
                <option value="zh-HK">{t('settings.langZhHK')}</option>
                <option value="zh-MO">{t('settings.langZhMO')}</option>
                <option value="ja">{t('settings.langJa')}</option>
                <option value="ko">{t('settings.langKo')}</option>
                <option value="en">{t('settings.langEn')}</option>
              </Form.Control>
              <Form.Text className="settings-hint">{t('settings.languageHint')}</Form.Text>
            </Col>
          </Form.Group>

          {/* 显示主题 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.theme')}
            </Form.Label>
            <Col sm={9}>
              <Form.Control
                as="select"
                size="sm"
                value={theme}
                onChange={e => {
                  const val = e.target.value;
                  setTheme(val);
                  optionsStorage.set({ theme: val });
                  applyTheme(val);
                }}
              >
                <option value="auto">{t('settings.themeAuto')}</option>
                <option value="light">{t('settings.themeLight')}</option>
                <option value="dark">{t('settings.themeDark')}</option>
              </Form.Control>
              <Form.Text className="settings-hint">{t('settings.themeHint')}</Form.Text>
            </Col>
          </Form.Group>

          {/* 启用系统通知 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.enableNotification')}
            </Form.Label>
            <Col sm={9}>
              <Form.Check
                type="switch"
                id="enableNotify"
                checked={enableNotify}
                onChange={e => {
                  const v = e.target.checked;
                  setEnableNotify(v);
                  optionsStorage.set({ enableNotify: v });
                }}
              />
              <Form.Text className="settings-hint">{t('settings.notificationHint')}</Form.Text>
            </Col>
          </Form.Group>
        </Card.Body>
      </Card>

      {/* ═══════ 同步策略 ═══════ */}
      <Card className="settings-card mt-3">
        <Card.Header className="settings-card-header">{t('settings.sync')}</Card.Header>
        <Card.Body>
          {/* 设备名称 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.deviceName')}
            </Form.Label>
            <Col sm={9}>
              <Form.Control
                type="text"
                size="sm"
                placeholder={t('settings.deviceNamePlaceholder')}
                value={deviceName}
                onChange={e => {
                  setDeviceName(e.target.value);
                  optionsStorage.set({ deviceName: e.target.value });
                }}
              />
              <Form.Text className="settings-hint">{t('settings.deviceNameHint')}</Form.Text>
            </Col>
          </Form.Group>

          {/* 开启自动同步 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.autoSync')}
            </Form.Label>
            <Col sm={9}>
              <Form.Check
                type="switch"
                id="autoSync"
                checked={autoSync}
                onChange={e => {
                  const v = e.target.checked;
                  setAutoSync(v);
                  optionsStorage.set({ autoSync: v });
                }}
              />
              <Form.Text className="settings-hint">{t('settings.autoSyncHint')}</Form.Text>
            </Col>
          </Form.Group>

          {/* 自动同步间隔 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.syncInterval')}
            </Form.Label>
            <Col sm={9}>
              <Form.Control
                as="select"
                size="sm"
                value={syncInterval}
                onChange={e => {
                  const v = e.target.value;
                  setSyncInterval(v);
                  const num = v === 'custom' ? parseInt(syncIntervalCustom || '30', 10) : parseInt(v, 10);
                  if (!isNaN(num) && num > 0) optionsStorage.set({ syncInterval: num });
                }}
              >
                <option value="5">{t('settings.intervalMin5')}</option>
                <option value="10">{t('settings.intervalMin10')}</option>
                <option value="30">{t('settings.intervalMin30')}</option>
                <option value="60">{t('settings.intervalMin60')}</option>
                <option value="120">{t('settings.intervalMin120')}</option>
                <option value="custom">{t('settings.intervalCustom')}</option>
              </Form.Control>
              {showSyncIntervalCustom && (
                <Form.Control
                  type="number"
                  size="sm"
                  className="mt-1"
                  placeholder={t('settings.customIntervalPlaceholder')}
                  value={syncIntervalCustom}
                  onChange={e => {
                      const v = e.target.value;
                      setSyncIntervalCustom(v);
                      const num = parseInt(v, 10);
                      if (!isNaN(num) && num > 0) optionsStorage.set({ syncInterval: num });
                    }}
                />
              )}
              <Form.Text className="settings-hint">{t('settings.syncIntervalHint')}</Form.Text>
            </Col>
          </Form.Group>

          {/* 格式化数据 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.formatJson')}
            </Form.Label>
            <Col sm={9}>
              <Form.Check
                type="switch"
                id="formatJson"
                checked={formatJson}
                onChange={e => {
                  const v = e.target.checked;
                  setFormatJson(v);
                  optionsStorage.set({ formatJson: v });

                }}
              />
              <Form.Text className="settings-hint">{t('settings.formatJsonHint')}</Form.Text>
            </Col>
          </Form.Group>

          {/* 冲突解决策略 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.conflictStrategy')}
            </Form.Label>
            <Col sm={9}>
              <Form.Control
                as="select"
                size="sm"
                value={conflictStrategy}
                onChange={e => {
                  setConflictStrategy(e.target.value);
                  optionsStorage.set({ conflictStrategy: e.target.value });
                }}
              >
                <option value="smart">{t('settings.smart')}</option>
                <option value="local">{t('settings.localPriority')}</option>
                <option value="remote">{t('settings.remotePriority')}</option>
                <option value="manual">{t('settings.manual')}</option>
              </Form.Control>
              <Form.Text className="settings-hint">{t('settings.conflictStrategyHint')}</Form.Text>
            </Col>
          </Form.Group>

          {/* 排序同步策略 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.orderSync')}
            </Form.Label>
            <Col sm={9}>
              <Form.Control
                as="select"
                size="sm"
                value={orderSyncStrategy}
                onChange={e => {
                  setOrderSyncStrategy(e.target.value);
                  optionsStorage.set({ orderSyncStrategy: e.target.value });
                }}
              >
                <option value="none">{t('settings.orderNone')}</option>
                <option value="cloud">{t('settings.orderCloud')}</option>
                <option value="local">{t('settings.orderLocal')}</option>
              </Form.Control>
              <Form.Text className="settings-hint">{t('settings.orderSyncHint')}</Form.Text>
            </Col>
          </Form.Group>

          {/* 开启端到端加密 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.enableEncryption')}
              <span className="settings-badge-important">{t('settings.stronglyRecommended')}</span>
            </Form.Label>
            <Col sm={9}>
              <Form.Check
                type="switch"
                id="enableEncryption"
                checked={enableEncryption}
                onChange={e => {
                  const v = e.target.checked;
                  setEnableEncryption(v);
                  optionsStorage.set({ enableEncryption: v });
                  if (!v) {
                    setEncryptionPassword('');
                    optionsStorage.set({ encryptionPassword: '' });
                  }
                }}
              />
              <Form.Text className="settings-hint">{t('settings.encryptionHint')}</Form.Text>
              {enableEncryption && (
                <Form.Control
                  type="password"
                  size="sm"
                  className="mt-2"
                  placeholder={t('settings.encryptionPasswordPlaceholder')}
                  value={encryptionPassword}
                  onChange={e => {
                    setEncryptionPassword(e.target.value);
                    optionsStorage.set({ encryptionPassword: e.target.value });
                  }}
                  style={{ maxWidth: 320 }}
                />
              )}
            </Col>
          </Form.Group>

          {/* 防误删保护 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.safeProtection')}
            </Form.Label>
            <Col sm={9}>
              <Form.Check
                type="switch"
                id="safeMode"
                checked={safeMode}
                onChange={e => { setSafeMode(e.target.checked); optionsStorage.set({ safeMode: e.target.checked }); }}
              />
              <Form.Text className="settings-hint">{t('settings.safeProtectionHint')}</Form.Text>
              {safeMode && (
                <div className="mt-2">
                  <div className="d-flex align-items-center">
                    <span className="settings-slider-label">{t('settings.safeThreshold')}：</span>
                    <input
                      type="range"
                      min={5}
                      max={50}
                      value={safeThreshold}
                      onChange={e => { setSafeThreshold(Number(e.target.value)); optionsStorage.set({ safeThreshold: Number(e.target.value) }); }}
                      className="settings-slider"
                    />
                    <span className="settings-slider-value">{t('settings.safeThresholdLabel', { n: safeThreshold })}</span>
                  </div>
                </div>
              )}
            </Col>
          </Form.Group>
        </Card.Body>
      </Card>

      {/* ═══════ 同步记录设置 ═══════ */}
      <Card className="settings-card mt-3">
        <Card.Header className="settings-card-header">{t('settings.snapshotSettings')}</Card.Header>
        <Card.Body>
          {/* 快照保留数量 */}
          <Form.Group as={Row} className="settings-row">
            <Form.Label column sm={3} className="settings-label">
              {t('settings.snapshotRetention')}
            </Form.Label>
            <Col sm={9}>
              <Form.Control
                as="select"
                size="sm"
                value={snapshotCount}
                onChange={e => {
                  const val = e.target.value;
                  setSnapshotCount(val);
                  if (val !== 'custom') optionsStorage.set({ snapshotCount: Number(val) });
                }}
              >
                <option value="10">{t('settings.snapshot10')}</option>
                <option value="20">{t('settings.snapshot20')}</option>
                <option value="50">{t('settings.snapshot50')}</option>
                <option value="100">{t('settings.snapshot100')}</option>
                <option value="custom">{t('settings.snapshotCustom')}</option>
              </Form.Control>
              {showSnapshotCustom && (
                <Form.Control
                  type="number"
                  size="sm"
                  className="mt-1"
                  placeholder={t('settings.customSnapshotPlaceholder')}
                  value={snapshotCustom}
                  onChange={e => {
                    const val = e.target.value;
                    setSnapshotCustom(val);
                    if (val) optionsStorage.set({ snapshotCount: Number(val) });
                  }}
                />
              )}
              <Form.Text className="settings-hint">{t('settings.snapshotHint')}</Form.Text>
            </Col>
          </Form.Group>
        </Card.Body>
      </Card>
    </div>
  );
};

export default BasicSettings;
