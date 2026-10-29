import { ImageResponse } from 'next/og';
export const runtime='nodejs';
export const alt='Rokn Alhenna — Hair care inspired by heritage';
export const size={width:1200,height:630};
export const contentType='image/png';
export default function Image(){return new ImageResponse(<div style={{display:'flex',width:'100%',height:'100%',background:'#FBF8F3',color:'#64283C',alignItems:'center',justifyContent:'center',flexDirection:'column',border:'28px solid #F5E6EA',fontFamily:'serif'}}><div style={{fontSize:76}}>Rokn Alhenna</div><div style={{fontSize:27,marginTop:28,color:'#30252A'}}>Hair care inspired by heritage</div><div style={{fontSize:20,marginTop:60,color:'#8a704c'}}>PALESTINE · ILS · CASH ON DELIVERY</div></div>,size);}
