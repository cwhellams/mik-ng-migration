create view flight.vw_flight_logs as

select *, 1 + (row_number-1) / rows_per_page as page_number from (
    select 
        l.flight_id,
        format_flight_time(ajlb.minutes_at_start + sum(l.flight_mins) over (
            partition by l.aircraft_registration, l.ajlb_seq_no  
            order by l.off_block_time_epoch)
        ) as ac_total_flight_time,
        count(*) over (
            partition by l.aircraft_registration, l.ajlb_seq_no
        ) as ajlb_flight_number,
        sum(l.ajlb_blank_rows_before + 1) over (
            partition by l.aircraft_registration, l.ajlb_seq_no
            order by l.off_block_time_epoch) as row_number,
        ajlb.rows_per_page as rows_per_page,
        (select last_name from member.register where member_id = l.pic_member_id) as pic_last_name,
        (select last_name from member.register where member_id = l.crew2_member_id) as crew2_last_name

    from flight.logs as l
        left join flight.aircraft_journey_log_book as ajlb on
        ajlb.aircraft_registration = l.aircraft_registration
        and ajlb.seq_no = l.ajlb_seq_no
);