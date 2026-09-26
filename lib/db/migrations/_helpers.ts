import { MysqlAdapter, sql, type CreateTableBuilder, type Kysely, type RawBuilder } from 'kysely'

export type MigrationDb = Kysely<unknown>

export function isMysql(db: MigrationDb): boolean {
  return db.getExecutor().adapter instanceof MysqlAdapter
}

/** Column types per DATABASE.md "Dialect translation". */
export function types(db: MigrationDb) {
  const my = isMysql(db)
  const t = (mysql: string, sqlite: string): RawBuilder<unknown> => sql.raw(my ? mysql : sqlite)
  return {
    uuid: t('char(36)', 'text'),
    varchar: (n: number) => t(`varchar(${n})`, 'text'),
    text: t('text', 'text'),
    int: t('int', 'integer'),
    bigint: t('bigint', 'integer'),
    bool: t('tinyint(1)', 'integer'),
    double: t('double', 'real'),
    datetime: t('datetime(3)', 'text'),
  }
}

/** InnoDB + utf8mb4 on MySQL; nothing on SQLite. */
export function tableOptions<T extends string, C extends string>(
  db: MigrationDb,
  builder: CreateTableBuilder<T, C>,
): CreateTableBuilder<T, C> {
  return isMysql(db) ? builder.modifyEnd(sql` engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`) : builder
}
