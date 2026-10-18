import { useMemo } from 'react';
import { OperationList } from '../components/OperationList';
import { useStore } from '../store/store';

export function InboxScreen() {
  const { data } = useStore();
  const inbox = useMemo(
    () => data.operations.filter((op) => !op.subcategoryId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [data.operations],
  );

  return (
    <div className="card inbox-card">
      <div className="card-head">
        <h2>Входящие</h2>
      </div>
      <p className="muted">
        Операции без категории за всё время. Начните печатать название подкатегории и нажмите Enter: курсор сам перейдёт к следующей операции.
        Чтобы назначить одну категорию сразу нескольким, выделите их нажатием на значок слева.
      </p>
      <OperationList ops={inbox} inbox emptyText="Всё разобрано 🎉 Операций без категории нет." />
    </div>
  );
}
