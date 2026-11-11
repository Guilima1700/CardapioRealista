export const browserEventTypes=['menu_open','category_view','product_view','model_view','ar_start','product_customize','modifier_select','recommendation_view','recommendation_click','add_to_cart','remove_from_cart','checkout_start'] as const;
export const serverEventTypes=['order_confirmed','order_completed','review_submitted','group_join'] as const;
export const allEventTypes=[...browserEventTypes,...serverEventTypes] as const;
