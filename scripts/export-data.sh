#!/bin/bash
# 导出沙箱数据库数据为 INSERT SQL 语句
set -e

PSQL="psql postgresql://postgres:51Huk3rd8GcV7p3Bwa@cp-hefty-swath-5de766c7.pg2.aidap-global.cn-beijing.volces.com:5432/postgres?sslmode=require"
OUT="/workspace/projects/scripts/backup-data.sql"

echo "-- 沙箱数据库备份" > "$OUT"
echo "-- 生成时间: $(date -u '+%Y-%m-%d %H:%M:%S UTC')" >> "$OUT"
echo "SET session_replication_role = 'replica'; -- 暂时禁用外键检查" >> "$OUT"
echo "" >> "$OUT"

TABLES=(
  users roles permissions role_permissions user_roles system_settings
  products warehouses inventory
  bom customers
  customer_orders customer_order_items customer_order_schedules
  production_orders production_order_materials
  inbound_notes inbound_note_items
  delivery_notes delivery_note_items
  delivery_category_groups product_drawings
)

for tbl in "${TABLES[@]}"; do
  echo "-- ======================== $tbl ========================" >> "$OUT"
  echo "TRUNCATE TABLE $tbl CASCADE;" >> "$OUT"
  # 用 psql 的 --csv 模式或 COPY 导出，然后转 INSERT
  # 使用 psql \copy 导出为 CSV，再读回来生成 INSERT
  COUNT=$($PSQL -t -c "SELECT count(*) FROM $tbl;" 2>/dev/null | tr -d ' ')
  echo "-- Rows: $COUNT" >> "$OUT"
  
  if [ "$COUNT" = "0" ]; then
    echo "-- (empty table)" >> "$OUT"
    echo "" >> "$OUT"
    continue
  fi
  
  # 获取列名
  COLS=$($PSQL -t -c "SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name = '$tbl' AND table_schema = 'public';" 2>/dev/null | tr -d ' ')
  
  # 导出数据为 INSERT 语句 - 使用 psql 的 COPY TO STDOUT 输出 CSV
  echo "INSERT INTO $tbl ($COLS) VALUES" >> "$OUT"
  
  # 用 psql 导出每一行为 INSERT VALUES
  $PSQL -c "COPY (SELECT * FROM $tbl) TO STDOUT WITH CSV" 2>/dev/null | while IFS= read -r line; do
    # 分割 CSV 并转义
    echo "  ($(echo "$line" | python3 -c "
import sys, csv, json
reader = csv.reader(sys.stdin)
for row in reader:
    vals = []
    for v in row:
        if v == '':
            vals.append('NULL')
        else:
            vals.append(json.dumps(v))
    print(', '.join(vals))
    break
"))," >> "$OUT"
  done
  
  # 去掉最后一行的逗号，改为分号
  sed -i '$ s/,$/;/' "$OUT"
  echo "" >> "$OUT"
done

echo "SET session_replication_role = 'origin'; -- 恢复外键检查" >> "$OUT"

LINES=$(wc -l < "$OUT")
echo "导出完成: $OUT ($LINES 行)"
