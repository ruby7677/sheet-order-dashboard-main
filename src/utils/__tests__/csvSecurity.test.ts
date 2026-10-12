import {describe,it,expect} from 'vitest';
import {safeCsvText,quoteCsvText} from '../csvSecurity';
describe('CSV spreadsheet formula safety',()=>{
 it('keeps legitimate logistics text and leading-zero text unchanged',()=>{for(const v of ['台北市中山路1號','0912345678','電話聯絡','A001'])expect(safeCsvText(v)).toBe(v);});
 it('neutralizes formula starts including whitespace and controls',()=>{for(const v of ['=1+1','+SUM(1,2)','-1+1','@SUM(1,2)','\t=1+1','\ufeff =1+1','\r\n=1+1'])expect(safeCsvText(v)).toBe("'"+v);});
 it('quotes comma/newline/quotes after formula protection',()=>{expect(quoteCsvText('台北,雲林')).toBe('"台北,雲林"');expect(quoteCsvText('=HYPERLINK("fixture")')).toBe('"\'=HYPERLINK(""fixture"")"');expect(quoteCsvText('a\nb')).toBe('"a\nb"');});
});
