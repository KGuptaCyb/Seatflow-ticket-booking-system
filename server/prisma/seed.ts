import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const image = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
const movies = [
  ['inception','Inception','A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea.','English',['Science Fiction','Thriller'],148,'UA','Christopher Nolan',['Leonardo DiCaprio','Joseph Gordon-Levitt'],8.8,'NOW_SHOWING','photo-1485846234645-a62644f84728'],
  ['interstellar','Interstellar','Explorers travel through a wormhole in space in an attempt to ensure humanity’s survival.','English',['Science Fiction','Drama'],169,'UA','Christopher Nolan',['Matthew McConaughey','Anne Hathaway'],8.7,'NOW_SHOWING','photo-1446776811953-b23d57bd21aa'],
  ['the-dark-knight','The Dark Knight','Batman faces a criminal mastermind who plunges Gotham into chaos.','English',['Action','Crime'],152,'UA','Christopher Nolan',['Christian Bale','Heath Ledger'],9.0,'NOW_SHOWING','photo-1531259683007-016a7b628fc3'],
  ['3-idiots','3 Idiots','Three engineering students navigate friendship, ambition, and a rigid education system.','Hindi',['Comedy','Drama'],171,'UA','Rajkumar Hirani',['Aamir Khan','Kareena Kapoor','R. Madhavan'],8.4,'NOW_SHOWING','photo-1481627834876-b7833e8f5570'],
  ['dangal','Dangal','A former wrestler trains his daughters to become champion wrestlers.','Hindi',['Biography','Sport','Drama'],161,'U','Nitesh Tiwari',['Aamir Khan','Fatima Sana Shaikh'],8.3,'NOW_SHOWING','photo-1461896836934-ffe607ba8211'],
  ['jawan','Jawan','A prison warden recruits women to expose systemic injustice in this action thriller.','Hindi',['Action','Thriller'],169,'UA','Atlee',['Shah Rukh Khan','Nayanthara'],7.0,'UPCOMING','photo-1500534623283-312aade485b7'],
] as const;

async function main() {
  const passwordHash = await bcrypt.hash('SeatflowDemo123!', 12);
  const admin = await prisma.user.upsert({ where:{email:'admin@seatflow.demo'}, update:{}, create:{name:'Seatflow Admin',email:'admin@seatflow.demo',passwordHash,role:'ADMIN'} });
  const organiser = await prisma.user.upsert({ where:{email:'organiser@seatflow.demo'}, update:{}, create:{name:'Cinema Curator',email:'organiser@seatflow.demo',passwordHash,role:'ORGANISER'} });
  await prisma.user.upsert({ where:{email:'customer@seatflow.demo'}, update:{}, create:{name:'Demo Customer',email:'customer@seatflow.demo',passwordHash,role:'CUSTOMER'} });
  const seatLayout = ['A','B','C','D','E','F'].flatMap((row,rowIndex)=>Array.from({length:10},(_,i)=>({row,number:i+1,category:rowIndex<2?'VIP':rowIndex<4?'Premium':'Standard'})));
  let venue = await prisma.venue.findFirst({where:{name:'Seatflow Cinemas — Andheri'}});
  if (!venue) venue = await prisma.venue.create({data:{name:'Seatflow Cinemas — Andheri',location:'Andheri West, Mumbai',details:'Auditorium 3 · Dolby Digital',seats:{create:seatLayout}}});
  const stored = [];
  for (const [slug,title,description,language,genres,durationMinutes,certification,director,cast,rating,status,picture] of movies) {
    stored.push(await prisma.movie.upsert({ where:{slug}, update:{}, create:{slug,title,description,language,genres:Array.from(genres),durationMinutes,certification,director,cast:Array.from(cast),rating,status:status as any,releaseDate:new Date('2025-01-01'),posterUrl:image(picture),backdropUrl:image(picture)} }));
  }
  const seats = await prisma.seat.findMany({where:{venueId:venue.id}});
  for (const [index,movie] of stored.entries()) {
    const startsAt = new Date(Date.now() + (index + 1) * 86_400_000); startsAt.setHours(index % 2 ? 19 : 14, 30, 0, 0);
    const existing = await prisma.event.findFirst({where:{movieId:movie.id,venueId:venue.id,startsAt}});
    if (existing) continue;
    const pricing = {Standard:22000 + (index % 2) * 2000,Premium:34000 + (index % 2) * 3000,VIP:52000 + (index % 2) * 4000};
    const showing = await prisma.event.create({data:{title:movie.title,description:movie.description,type:'MOVIE',movieId:movie.id,venueId:venue.id,organiserId:organiser.id,startsAt,endsAt:new Date(startsAt.getTime()+movie.durationMinutes*60_000),status:'PUBLISHED',pricing}});
    await prisma.eventSeat.createMany({data:seats.map(seat=>({eventId:showing.id,seatId:seat.id,category:seat.category,price:pricing[seat.category as keyof typeof pricing]}))});
  }
  console.log(`Seed complete. Admin ${admin.email}; organiser ${organiser.email}; customer customer@seatflow.demo`);
}
main().finally(()=>prisma.$disconnect());
