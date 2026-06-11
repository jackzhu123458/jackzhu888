import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/orders - 获取客户订单列表，按客户分组
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supabase = getSupabaseClient();
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword');

    let query = supabase
      .from('customer_orders')
      .select(`
        *,
        customers(id, name, code, contact, phone),
        customer_order_items(
          *,
          products(id, code, name, spec, unit),
          customer_order_schedules(*)
        )
      `)
      .order('created_at', { ascending: false });

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (keyword) {
      query = query.or(`order_no.ilike.%${keyword}%,remark.ilike.%${keyword}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/orders - 创建客户订单
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_id, order_no, order_date, delivery_deadline, remark, items } = body;

    const supabase = getSupabaseClient();
    if (!customer_id || !order_no) {
      return NextResponse.json({ error: '客户ID和订单号必填' }, { status: 400 });
    }

    // 创建订单主记录
    const { data: order, error: orderError } = await supabase
      .from('customer_orders')
      .insert({
        customer_id,
        order_no,
        order_date: order_date || new Date().toISOString().split('T')[0],
        delivery_deadline,
        remark,
        status: 'pending',
      })
      .select()
      .single();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    // 创建订单明细
    if (items && items.length > 0) {
      const orderItems = items.map((item: { product_id: string; quantity: number; price?: number; remark?: string }) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price || null,
        remark: item.remark || null,
      }));

      const { data: insertedItems, error: itemsError } = await supabase
        .from('customer_order_items')
        .insert(orderItems)
        .select();

      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 });
      }

      // 创建排程记录
      const schedules: { order_item_id: string; schedule_date: string; quantity: number }[] = [];
      for (const item of items) {
        if (item.schedules && Array.isArray(item.schedules)) {
          for (const s of item.schedules) {
            if (s.schedule_date && s.quantity > 0) {
              const insertedItem = insertedItems.find((ii: { product_id: string }) => ii.product_id === item.product_id);
              if (insertedItem) {
                schedules.push({
                  order_item_id: insertedItem.id,
                  schedule_date: s.schedule_date,
                  quantity: s.quantity,
                });
              }
            }
          }
        }
      }

      if (schedules.length > 0) {
        const { error: schedError } = await supabase
          .from('customer_order_schedules')
          .insert(schedules);

        if (schedError) {
          return NextResponse.json({ error: schedError.message }, { status: 500 });
        }
      }
    }

    // 重新查询完整数据返回
    const { data: fullOrder, error: fetchError } = await supabase
      .from('customer_orders')
      .select(`
        *,
        customers(id, name, code, contact, phone),
        customer_order_items(
          *,
          products(id, code, name, spec, unit),
          customer_order_schedules(*)
        )
      `)
      .eq('id', order.id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json(fullOrder, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/orders - 更新客户订单
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { id, customer_id, order_no, order_date, delivery_deadline, remark, status, items } = body;

    if (!id) {
      return NextResponse.json({ error: '订单ID必填' }, { status: 400 });
    }

    // 更新订单主记录
    const updateData: Record<string, unknown> = {};
    if (customer_id !== undefined) updateData.customer_id = customer_id;
    if (order_no !== undefined) updateData.order_no = order_no;
    if (order_date !== undefined) updateData.order_date = order_date;
    if (delivery_deadline !== undefined) updateData.delivery_deadline = delivery_deadline;
    if (remark !== undefined) updateData.remark = remark;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('customer_orders')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    // 如果有明细更新
    if (items !== undefined) {
      // 先删除旧排程
      const { data: oldItems } = await supabase
        .from('customer_order_items')
        .select('id')
        .eq('order_id', id);

      if (oldItems && oldItems.length > 0) {
        const oldItemIds = oldItems.map((oi: { id: string }) => oi.id);
        await supabase
          .from('customer_order_schedules')
          .delete()
          .in('order_item_id', oldItemIds);
        await supabase
          .from('customer_order_items')
          .delete()
          .eq('order_id', id);
      }

      // 重新插入明细
      if (items.length > 0) {
        const orderItems = items.map((item: { product_id: string; quantity: number; price?: number; remark?: string }) => ({
          order_id: id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price || null,
          remark: item.remark || null,
        }));

        const { data: insertedItems, error: itemsError } = await supabase
          .from('customer_order_items')
          .insert(orderItems)
          .select();

        if (itemsError) {
          return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        // 重新插入排程
        const schedules: { order_item_id: string; schedule_date: string; quantity: number }[] = [];
        for (const item of items) {
          if (item.schedules && Array.isArray(item.schedules)) {
            for (const s of item.schedules) {
              if (s.schedule_date && s.quantity > 0) {
                const insertedItem = insertedItems.find((ii: { product_id: string }) => ii.product_id === item.product_id);
                if (insertedItem) {
                  schedules.push({
                    order_item_id: insertedItem.id,
                    schedule_date: s.schedule_date,
                    quantity: s.quantity,
                  });
                }
              }
            }
          }
        }

        if (schedules.length > 0) {
          await supabase.from('customer_order_schedules').insert(schedules);
        }
      }
    }

    // 查询完整数据返回
    const { data: fullOrder, error: fetchError } = await supabase
      .from('customer_orders')
      .select(`
        *,
        customers(id, name, code, contact, phone),
        customer_order_items(
          *,
          products(id, code, name, spec, unit),
          customer_order_schedules(*)
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json(fullOrder);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/orders - 删除客户订单
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseClient();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '订单ID必填' }, { status: 400 });
    }

    // 先删除排程
    const { data: items } = await supabase
      .from('customer_order_items')
      .select('id')
      .eq('order_id', id);

    if (items && items.length > 0) {
      const itemIds = items.map((i: { id: string }) => i.id);
      await supabase.from('customer_order_schedules').delete().in('order_item_id', itemIds);
    }

    // 删除明细
    await supabase.from('customer_order_items').delete().eq('order_id', id);

    // 删除订单
    const { error } = await supabase.from('customer_orders').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
