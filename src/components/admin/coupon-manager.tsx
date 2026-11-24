"use client";
import { useEffect, useState } from "react";
type Coupon={_id:string;code:string;discountType:"fixed"|"percentage";discountValue:number;minimumOrderPaise:number;validFrom:string;validUntil:string;status:string;uses:number};
export function CouponManager(){
 const [items,setItems]=useState<Coupon[]>([]),[message,setMessage]=useState("");
 async function load(){const r=await fetch("/api/admin/coupons",{cache:"no-store"});if(r.ok)setItems((await r.json()).items);}
 useEffect(()=>{void Promise.resolve().then(load)},[]);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const body={code:f.get("code"),discountType:f.get("type"),discountValue:Number(f.get("value")),minimumOrderPaise:Number(f.get("minimum")||0),validFrom:new Date(String(f.get("from"))).toISOString(),validUntil:new Date(String(f.get("until"))).toISOString(),status:"active"};const r=await fetch("/api/admin/coupons",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});setMessage(r.ok?"Coupon created.":"Coupon could not be created.");if(r.ok){e.currentTarget.reset();await load();}}
 async function deactivate(id:string){const r=await fetch("/api/admin/coupons/"+id,{method:"DELETE"});setMessage(r.ok?"Coupon deactivated.":"Coupon update failed.");await load();}
 return <main className="mx-auto max-w-5xl px-5 py-12"><h1 className="text-3xl font-semibold">Coupons</h1><form onSubmit={submit} className="mt-6 grid gap-3 rounded-xl border border-border p-5 sm:grid-cols-2">
 <label>Code<input required name="code" minLength={3} maxLength={64} className="mt-1 block min-h-11 w-full rounded border border-border bg-background px-3"/></label>
 <label>Discount type<select name="type" className="mt-1 block min-h-11 w-full rounded border border-border bg-background px-3"><option value="percentage">Percentage (basis points)</option><option value="fixed">Fixed (paise)</option></select></label>
 <label>Value<input required name="value" type="number" min="1" className="mt-1 block min-h-11 w-full rounded border border-border bg-background px-3"/></label>
 <label>Minimum order (paise)<input name="minimum" type="number" min="0" defaultValue="0" className="mt-1 block min-h-11 w-full rounded border border-border bg-background px-3"/></label>
 <label>Starts<input required name="from" type="datetime-local" className="mt-1 block min-h-11 w-full rounded border border-border bg-background px-3"/></label>
 <label>Expires<input required name="until" type="datetime-local" className="mt-1 block min-h-11 w-full rounded border border-border bg-background px-3"/></label>
 <button className="min-h-11 rounded-full bg-accent px-4 font-semibold text-[#0f1e36]">Create coupon</button><p role="status">{message}</p></form>
 <div className="mt-8 grid gap-3">{items.map(c=><article key={c._id} className="rounded-xl border border-border p-4"><strong>{c.code}</strong>   {c.discountType} {c.discountValue}   {c.status}   {c.uses} redeemed   expires {new Date(c.validUntil).toLocaleDateString("en-IN")} {c.status==="active"&&<button onClick={()=>void deactivate(c._id)} className="ml-4 underline">Deactivate</button>}</article>)}</div></main>
}
