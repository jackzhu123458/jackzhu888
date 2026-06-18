#!/usr/bin/env python3
"""导出沙箱数据库数据为 PostgreSQL INSERT 语句"""
import csv
import io
import psycopg2
import sys

DB_URL = "postgresql://postgres:51Huk3rd8GcV7p3Bwa@cp-hefty-swath-5de766c7.pg2.aidap-global.cn-beijing.volces.com:5432/postgres?sslmode=require"
OUTPUT = "/workspace/projects/scripts/backup-data.sql"

TABLES = [
    "roles", "permissions", "role_permissions", "users", "user_roles", "system_settings",
    "warehouses", "products", "inventory", "bom",
    "customers",
    "customer_orders", "customer_order_items", "customer_order_schedules",
    "production_orders", "production_order_materials",
    "inbound_notes", "inbound_note_items",
    "delivery_notes", "delivery_note_items",
    "delivery_category_groups", "product_drawings",
]

def escape_sql(val, col_type=None):
    """转义 PostgreSQL 字符串值"""
    if val is None or val == '' or val == 'None':
        return 'NULL'
    # 布尔值
    if val == 'True' or val == 'true' or val == 't':
        return 'true'
    if val == 'False' or val == 'false' or val == 'f':
        return 'false'
    # 尝试判断是否为数字
    try:
        float(val)
        # UUID 格式检查
        if '-' in val and len(val) == 36:
            return f"'{val}'"
        return val
    except (ValueError, TypeError):
        pass
    # UUID 检查
    if len(val) == 36 and val.count('-') == 4:
        return f"'{val}'"
    # 字符串：单引号包裹，内部单引号翻倍
    escaped = val.replace("'", "''")
    return f"'{escaped}'"

def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write("-- 沙箱数据库备份\n")
        f.write("-- 生成时间: 2026-06-18\n")
        f.write("SET session_replication_role = 'replica';\n\n")
        
        for table in TABLES:
            # 获取列名
            cur.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = %s AND table_schema = 'public'
                ORDER BY ordinal_position
            """, (table,))
            cols = [r[0] for r in cur.fetchall()]
            if not cols:
                f.write(f"-- {table}: table not found, skipping\n\n")
                continue
            
            col_list = ', '.join(cols)
            
            # 获取数据
            cur.execute(f'SELECT * FROM "{table}"')
            rows = cur.fetchall()
            
            f.write(f"-- ======================== {table} ({len(rows)} rows) ========================\n")
            f.write(f"TRUNCATE TABLE {table} CASCADE;\n")
            
            if not rows:
                f.write("-- (empty)\n\n")
                continue
            
            f.write(f"INSERT INTO {table} ({col_list}) VALUES\n")
            
            for i, row in enumerate(rows):
                values = ', '.join(escape_sql(str(v) if v is not None else None) for v in row)
                if i < len(rows) - 1:
                    f.write(f"  ({values}),\n")
                else:
                    f.write(f"  ({values});\n")
            
            f.write("\n")
        
        f.write("SET session_replication_role = 'origin';\n")
    
    cur.close()
    conn.close()
    
    # 统计行数
    with open(OUTPUT, 'r') as f:
        lines = f.readlines()
    print(f"导出完成: {OUTPUT} ({len(lines)} 行)")

if __name__ == '__main__':
    main()
