import { describe, expect, it } from 'vitest';
import { toPublicProduct } from '../../src/lib/availability';

describe('Public product availability and inventory privacy',()=>{
  it.each([
    [true,false,null,true],
    [true,false,0,true],
    [false,false,null,false],
    [true,true,10,true],
    [true,true,0,false],
    [true,true,null,false],
    [true,true,-1,false],
    [false,true,10,false],
  ] as const)('manual=%s tracking=%s quantity=%s exposes available=%s',(available,stockTracked,stockQuantity,expected)=>{
    const product={id:'product-test',name:'منتج اختبار',priceAgorot:7500,available,stockTracked,stockQuantity};
    const result=toPublicProduct(product);
    expect(result.available).toBe(expected);
    expect(result).toEqual({id:'product-test',name:'منتج اختبار',priceAgorot:7500,available:expected});
    expect(result).not.toHaveProperty('stockQuantity');
    expect(result).not.toHaveProperty('stockTracked');
    expect(JSON.stringify(result)).not.toMatch(/stockQuantity|stockTracked/);
    expect(product.stockQuantity).toBe(stockQuantity);
    expect(product.available).toBe(available);
  });
});
