export { default as React, useEffect, useRef, useState } from 'react';
export { io } from 'socket.io-client';
export { ArrowRight, BadgeCheck, BarChart3, Camera, HeartHandshake, Check, ChevronLeft, Clock3, CreditCard, FileCheck2, Home, LockKeyhole, LogOut, MessageCircle, Send, ShieldCheck, Sparkles, UserRound, UsersRound } from 'lucide-react';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const accounts = [['Tenant 1','tenant1'],['Tenant 2','tenant2'],['Operator','operatorA']];
export const survey=[
 ['lateReturnBand','Late return frequency after midnight',['0\ud68c','1~2\ud68c','3~5\ud68c','6\ud68c \uc774\uc0c1']],
 ['sleepTimeBand','Usual sleep time',['22\uc2dc \uc774\uc804','22~24\uc2dc','00~02\uc2dc','02\uc2dc \uc774\ud6c4']],
 ['wakeTimeBand','Usual wake time',['06\uc2dc \uc774\uc804','06~08\uc2dc','08~10\uc2dc','10\uc2dc \uc774\ud6c4']],
 ['deliveryWasteBand','Weekly delivery frequency',['0\ud68c','1~2\ud68c','3~4\ud68c','5\ud68c \uc774\uc0c1']],
 ['cleaningBand','Shared-space cleaning frequency',['\uc8fc 1\ud68c \uc774\uc0c1','\uc6d4 1\ud68c','\uac70\uc758 \uc548 \ud568','\uc0c1\ud669\uc5d0 \ub530\ub77c']],
 ['noiseBand','Late-hour noise frequency',['\uac70\uc758 \uc5c6\uc74c','\uac00\ub054 \uc788\uc74c','\uc8fc 1~2\ud68c','\uc790\uc8fc \uc788\uc74c']],
 ['guestFrequencyBand','Weekly guest invitation frequency',['0\ud68c','1\ud68c','2~3\ud68c','4\ud68c \uc774\uc0c1']],
 ['cookingBand','Weekly cooking frequency',['0\ud68c','1~2\ud68c','3~5\ud68c','6\ud68c \uc774\uc0c1']],
 ['commonSpaceBand','Shared-space cleanup habit',['\ud56d\uc0c1 \uc815\ub9ac','\ub300\ubd80\ubd84 \uc815\ub9ac','\uac00\ub054 \ubbf8\ub8f8','\uc790\uc8fc \ubbf8\ub8f8']]
];
export const initialAnswers={lateReturnBand:1,sleepTimeBand:1,wakeTimeBand:1,deliveryWasteBand:1,cleaningBand:1,noiseBand:1,guestFrequencyBand:1,cookingBand:1,commonSpaceBand:1,roomType:'private_room',shareCount:2,preferredGender:'any',ageBand:'any'};
export function embed(){const p=new URLSearchParams(location.search),saved=JSON.parse(sessionStorage.getItem('cm-context')||'null'),context={operatorId:p.get('operator_id')||saved?.operatorId||'operator-a',roomId:p.get('room_id')||saved?.roomId||'101',funnelId:saved?.funnelId||crypto.randomUUID()};sessionStorage.setItem('cm-context',JSON.stringify(context));return context}
export function event(context,step){return fetch(API+'/api/v1/funnel/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...context,step})}).catch(()=>{})}
export async function responseJson(response){if(response.status===401){sessionStorage.removeItem('cm-auth');window.dispatchEvent(new Event('cm-auth-expired'))}const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'API_REQUEST_FAILED');return data}



