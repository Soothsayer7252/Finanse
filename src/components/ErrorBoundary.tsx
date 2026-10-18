// Если в каком-то разделе случится ошибка, вместо пустой страницы показываем,
// что произошло, и даём сохранить данные. Сами данные при этом не теряются.

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** При смене значения ошибка сбрасывается (например, при переходе в другой раздел). */
  resetKey: string;
  onBackup: () => void;
}

interface State {
  error: Error | null;
  key: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    console.error('Ошибка в разделе:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card crash" role="alert">
        <h2>В этом разделе произошла ошибка</h2>
        <p>Ваши данные на месте. Перейдите в другой раздел или сохраните копию. Пришлите текст ниже, чтобы ошибку исправили.</p>
        <pre className="crash-text">{String(this.state.error?.stack || this.state.error)}</pre>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={this.props.onBackup}>
            Скачать копию данных
          </button>
        </div>
      </div>
    );
  }
}
